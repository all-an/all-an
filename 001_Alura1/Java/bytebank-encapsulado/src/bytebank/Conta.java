package bytebank;

public class Conta { //classe blueprint planta para crian��o de objetos
	private double saldo; //private limita o acesso a este atributo apenas por m�todos, exemplos nos m�todos abaixo
	private int agencia; //atributos
	private int numero;
	private Cliente titular = new Cliente();// Este c�digo >  = new Cliente(); ja cria em tempo de execu��o um objeto referenciando a classe Cliente
	//um contador para o total de contas
	private static int total; //static amplia este atributo a todos os objetos da classe, static quer dizer da classe
	
	
	//construtores
	public Conta(int agencia, int numero) { //um construtor por padr�o � vazio sem par�metros � o padr�o j� criado automaticamente pelo Java
		Conta.total++;
		System.out.println("O total de contas � : " + Conta.total);
		this.agencia = agencia;
		this.numero = numero;
		System.out.println("Conta criada, n�mero: " + this.numero);
	}
	
	public void deposita(double valor) { //valor � um argumento do m�todo, m�todos lembram fun��es
		this.saldo += valor; //this quer dizer para o objeto espec�fico que chamou o metodo
	}
	
	public boolean saca(double valor) { //retorna um booleano e n�o void / nada para quem chama este m�todo
		if(this.saldo >= valor) {
			this.saldo -= valor; //this mais uma vez se referindo ao objeto que chamou o metodo
			return true;
		} else { 
			return false;
		}
	}
	
	public boolean transfere(double valor, Conta destino) {
		if(this.saldo >= valor) {
			saca(valor); 
			destino.deposita(valor);
			return true;
		}
		return false;  
		
	}
	
	public double getSaldo() { //get � conven��o //m�todo getter para o atributo saldo que � privado
		return this.saldo;
	}

	public int getNumero() {
		return this.numero;
	}

	public void setNumero(int numero) { //par�metro � uma vari�vel definida junto da fun��o , pode-se e usa-se normalmente o mesmo nome do atributo   
		if(numero <= 0) {
			System.out.println("Proibido numero menor ou igual a zero");
			return;
		}
		this.numero = numero; //atribui ao atributo numero o par�metro novoNumero
	}
	
	public int getAgencia() {
		return this.agencia;
	}
	
	public void setAgencia(int agencia) { //setAg ctrl espa�o gera o m�todo automaticamente criando o par�metro agencia 
		if(agencia <= 0) {
			System.out.println("Proibido numero menor ou igual a zero");
			return;
		}
		this.agencia = agencia;
	}
	
	public void setTitular(Cliente titular) {
		this.titular = titular;
	}
	
	public Cliente getTitular() {
		return titular;
	}
	
	public static int getTotal() { //static, o m�todo � da classe
		return Conta.total;
	}
}
 