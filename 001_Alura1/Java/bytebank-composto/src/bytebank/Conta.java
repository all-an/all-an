package bytebank;

public class Conta { //classe blueprint planta para crianção de objetos
	private double saldo; //private limita o acesso a este atributo apenas por métodos, exemplos nos métodos abaixo
	int agencia; //atributos
	int numero;
	Cliente titular = new Cliente();// Este código >  = new Cliente(); ja cria em tempo de execução um objeto referenciando a classe Cliente
	
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
}
 