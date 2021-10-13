package bytebank;

public class Conta { //classe blueprint planta para crianção de objetos
	private double saldo; //private limita o acesso a este atributo apenas por métodos, exemplos nos métodos abaixo
	private int agencia; //atributos
	private int numero;
	private Cliente titular = new Cliente();// Este código >  = new Cliente(); ja cria em tempo de execução um objeto referenciando a classe Cliente
	//um contador para o total de contas
	private static int total; //static amplia este atributo a todos os objetos da classe, static quer dizer da classe
	
	
	//construtores
	public Conta(int agencia, int numero) { //um construtor por padrão é vazio sem parâmetros é o padrão já criado automaticamente pelo Java
		Conta.total++;
		System.out.println("O total de contas é : " + Conta.total);
		this.agencia = agencia;
		this.numero = numero;
		System.out.println("Conta criada, número: " + this.numero);
	}
	
	public void deposita(double valor) { //valor é um argumento do método, métodos lembram funções
		this.saldo += valor; //this quer dizer para o objeto específico que chamou o metodo
	}
	
	public boolean saca(double valor) { //retorna um booleano e não void / nada para quem chama este método
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
	
	public double getSaldo() { //get é convenção //método getter para o atributo saldo que é privado
		return this.saldo;
	}

	public int getNumero() {
		return this.numero;
	}

	public void setNumero(int numero) { //parâmetro é uma variável definida junto da função , pode-se e usa-se normalmente o mesmo nome do atributo   
		if(numero <= 0) {
			System.out.println("Proibido numero menor ou igual a zero");
			return;
		}
		this.numero = numero; //atribui ao atributo numero o parâmetro novoNumero
	}
	
	public int getAgencia() {
		return this.agencia;
	}
	
	public void setAgencia(int agencia) { //setAg ctrl espaço gera o método automaticamente criando o parâmetro agencia 
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
	
	public static int getTotal() { //static, o método é da classe
		return Conta.total;
	}
}
 