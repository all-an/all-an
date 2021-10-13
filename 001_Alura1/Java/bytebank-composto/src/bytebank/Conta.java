package bytebank;

public class Conta { //classe blueprint planta para crian��o de objetos
	private double saldo; //private limita o acesso a este atributo apenas por m�todos, exemplos nos m�todos abaixo
	int agencia; //atributos
	int numero;
	Cliente titular = new Cliente();// Este c�digo >  = new Cliente(); ja cria em tempo de execu��o um objeto referenciando a classe Cliente
	
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
}
 